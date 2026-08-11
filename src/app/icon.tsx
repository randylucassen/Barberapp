import { ImageResponse } from "next/og";

// Functionele placeholder tot er een echt gedesigned logo is (zie
// "Bekende gaps" in PROJECT.md) — zwart vlak in de primary-designtoken
// (#111111) met een witte "G".
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#111111",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 700,
          borderRadius: 7,
        }}
      >
        G
      </div>
    ),
    { ...size }
  );
}
