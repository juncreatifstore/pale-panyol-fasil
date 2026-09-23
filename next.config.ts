import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "xvmvppfziiymqjvhciax.supabase.co", pathname: "/storage/v1/object/public/book-media/**" }],
  },
};

export default nextConfig;
