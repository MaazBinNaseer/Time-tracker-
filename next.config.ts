import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // The weekly timesheet now lives inside the Calendar page.
    return [{ source: "/week", destination: "/calendar?view=week", permanent: false }];
  },
};

export default nextConfig;
