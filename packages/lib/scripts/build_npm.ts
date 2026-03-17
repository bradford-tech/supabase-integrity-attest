import { build, emptyDir } from "@deno/dnt";

const version = Deno.args[0]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: deno run -A scripts/build_npm.ts <version>");
  Deno.exit(1);
}

await emptyDir("./npm");

await build({
  entryPoints: [
    "./mod.ts",
    { name: "./assertion", path: "./assertion.ts" },
    { name: "./attestation", path: "./attestation.ts" },
  ],
  outDir: "./npm",
  shims: {
    deno: { test: "dev" },
  },
  scriptModule: false,
  compilerOptions: {
    lib: ["ESNext", "DOM"],
  },
  package: {
    name: "@bradford-tech/supabase-integrity-attest",
    version,
    description:
      "Verify Apple App Attest attestations and assertions using WebCrypto.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/bradford-tech/supabase-integrity-attest.git",
    },
    homepage: "https://integrity-attest.bradford.tech",
    bugs: {
      url: "https://github.com/bradford-tech/supabase-integrity-attest/issues",
    },
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
