use rustls::crypto::{ring, CryptoProvider};

pub fn initialize() -> Result<(), String> {
    if CryptoProvider::get_default().is_some() {
        return Ok(());
    }

    match ring::default_provider().install_default() {
        Ok(()) => Ok(()),
        // Another networking task may have installed the provider first.
        Err(_) if CryptoProvider::get_default().is_some() => Ok(()),
        Err(_) => Err("Could not initialize the network crypto provider.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn initializes_tls_builders_with_both_provider_features_enabled() -> Result<(), String> {
        super::initialize()?;
        super::initialize()?;
        let _client = rustls::ClientConfig::builder();
        let _server = rustls::ServerConfig::builder();
        assert!(rustls::crypto::CryptoProvider::get_default().is_some());
        Ok(())
    }
}
