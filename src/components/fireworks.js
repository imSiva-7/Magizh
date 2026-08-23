"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

const FireworksOnce = () => {
  useEffect(() => {
    // Check if the user has already seen the fireworks
    const hasSeenFireworks = localStorage.getItem("hasSeenFireworks");
    // if (hasSeenFireworks) return;

    // Fire a series of confetti bursts that look like fireworks
    const duration = 3 * 1000; // 3 seconds
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ["#ff0", "#f00", "#0ff", "#0f0", "#ff8800"],
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ["#ff0", "#f00", "#0ff", "#0f0", "#ff8800"],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();

    // Set the flag so it only plays once
    localStorage.setItem("hasSeenFireworks", "true");
  }, []);

  return null; // This component doesn't render anything visually
};

export default FireworksOnce;