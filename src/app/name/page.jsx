"use client";

import { useState, useEffect } from "react";

export default function Name() {
  const [name, setName] = useState("");

  useEffect(() => {}, []);

  const handleSubmit = async () => {
    try {
      const res = await fetch("/api/name", {
        method: "POST",
        body: JSON.stringify({ uname: name }),
      });

      if (!res.ok) return new Error("Error");
    } catch (error) {}
  };

  return (
    <>
      <h1> {name}</h1>
      <form>
        <input
          type="text"
          placeholder="enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>

        <button onClick={() => handleSubmit()}> submit</button>
      </form>
      <p>{name}</p>
    </>
  );
}
