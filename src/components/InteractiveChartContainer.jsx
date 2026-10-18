"use client";

import { useState } from "react";
import { ResponsiveContainer } from "recharts";
import styles from "./InteractiveChartContainer.module.css";

export default function InteractiveChartContainer(props) {
  const [interacting, setInteracting] = useState(false);

  return (
    <div
      className={styles.container}
      data-interacting={interacting}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setInteracting(true);
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse" || event.buttons) setInteracting(true);
      }}
      onPointerDown={() => setInteracting(true)}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") setInteracting(false);
      }}
      onPointerLeave={() => setInteracting(false)}
      onPointerCancel={() => setInteracting(false)}
    >
      <ResponsiveContainer {...props} />
    </div>
  );
}
