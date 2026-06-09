use std::net::{IpAddr, Ipv4Addr};

const PREFERRED_INTERFACE_WORDS: [&str; 5] = ["wi-fi", "wifi", "wlan", "ethernet", "lan"];
const BLOCKED_INTERFACE_WORDS: [&str; 8] = [
    "loopback",
    "virtual",
    "vmware",
    "virtualbox",
    "hyper-v",
    "wsl",
    "docker",
    "tailscale",
];

pub fn pairing_host() -> Result<String, String> {
    let interfaces = local_ip_address::list_afinet_netifas()
        .map_err(|error| format!("Could not read network adapters: {error}"))?;

    let candidates: Vec<(String, Ipv4Addr)> = interfaces
        .into_iter()
        .filter_map(|(name, address)| match address {
            IpAddr::V4(ip) if is_pairing_address(ip) => Some((name, ip)),
            _ => None,
        })
        .collect();

    if let Some((_, address)) = candidates
        .iter()
        .find(|(name, _)| is_preferred_interface(name))
    {
        return Ok(address.to_string());
    }

    if let Some((_, address)) = candidates
        .iter()
        .find(|(name, _)| !is_blocked_interface(name))
    {
        return Ok(address.to_string());
    }

    candidates
        .first()
        .map(|(_, address)| address.to_string())
        .ok_or_else(|| {
            "No LAN IPv4 address found. Connect desktop and phone to the same network.".to_string()
        })
}

fn is_pairing_address(address: Ipv4Addr) -> bool {
    !address.is_loopback()
        && !address.is_link_local()
        && !address.is_broadcast()
        && !address.is_documentation()
        && !address.is_unspecified()
        && is_private_lan_address(address)
}

fn is_private_lan_address(address: Ipv4Addr) -> bool {
    address.is_private()
}

fn is_preferred_interface(name: &str) -> bool {
    let name = name.to_lowercase();
    PREFERRED_INTERFACE_WORDS
        .iter()
        .any(|word| name.contains(word))
        && !BLOCKED_INTERFACE_WORDS
            .iter()
            .any(|word| name.contains(word))
}

fn is_blocked_interface(name: &str) -> bool {
    let name = name.to_lowercase();
    BLOCKED_INTERFACE_WORDS
        .iter()
        .any(|word| name.contains(word))
}

#[cfg(test)]
mod tests {
    use super::{is_pairing_address, is_preferred_interface};

    #[test]
    fn accepts_private_lan_addresses() {
        assert!(is_pairing_address(
            "192.168.0.10".parse().expect("valid ip")
        ));
        assert!(is_pairing_address("10.0.0.2".parse().expect("valid ip")));
    }

    #[test]
    fn rejects_loopback_and_link_local_addresses() {
        assert!(!is_pairing_address("127.0.0.1".parse().expect("valid ip")));
        assert!(!is_pairing_address(
            "169.254.1.4".parse().expect("valid ip")
        ));
    }

    #[test]
    fn prefers_real_lan_interface_names() {
        assert!(is_preferred_interface("Wi-Fi"));
        assert!(is_preferred_interface("Ethernet"));
        assert!(!is_preferred_interface("vEthernet (WSL)"));
    }
}
