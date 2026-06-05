import { useState } from "react";
import { MobileLayout } from "./layouts/MobileLayout";
import { greet } from "@shared/utils/api";
import { Button } from "@shared/components/Button";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function handleGreet() {
    setGreetMsg(await greet(name));
  }

  return (
    <MobileLayout>
      <h1>eko Mobile</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleGreet();
        }}
      >
        <input onChange={(e) => setName(e.currentTarget.value)} placeholder="Enter a name..." />
        <Button type="submit">Greet</Button>
      </form>
      <p>{greetMsg}</p>
    </MobileLayout>
  );
}

export default App;
