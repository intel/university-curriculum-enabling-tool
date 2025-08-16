import { withPayload } from "@payloadcms/next/withPayload"
import { readFileSync } from "fs"
import path from "path"

const isStandalone = process.env.STANDALONE_BUILD === "true"
const packageJsonPath = path.resolve(process.cwd(), "package.json")
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
const persona = process.env.PERSONA || "faculty"
const personaView = process.env.PERSONA_VIEW || "default"

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: isStandalone ? path.join(`next-${persona}`) : `.next`,
  output: isStandalone ? "standalone" : undefined,
  outputFileTracingRoot: isStandalone
    ? path.resolve(process.cwd()) // Use a separate folder for standalone output
    : process.cwd(),
  env: {
    NEXT_PUBLIC_APP_NAME: packageJson.name,
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_PERSONA: persona,
    NEXT_PUBLIC_PERSONA_VIEW: personaView
  }
}

export default withPayload(nextConfig)
