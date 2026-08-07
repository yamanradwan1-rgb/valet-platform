import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Valet Employee App",
    short_name: "Valet",
    description: "Valet Platform employee application",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#172033",
  };
}
