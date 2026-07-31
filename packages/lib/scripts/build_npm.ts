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
    { name: "./supabase", path: "./supabase.ts" },
  ],
  outDir: "./npm",
  test: false,
  // Types are checked by `deno task check`; dnt's node-side re-check breaks
  // on TS >= 5.7 generic Uint8Array vs DOM BufferSource.
  typeCheck: false,
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
    Deno.mkdirSync("npm/sql", { recursive: true });
    Deno.copyFileSync("sql/app_attest.sql", "npm/sql/app_attest.sql");
  },
});

// With typeCheck disabled above, at least prove the emitted artifact
// resolves: import every published entry point under Node before publish.
const smoke = new Deno.Command("node", {
  args: [
    "--input-type=module",
    "-e",
    [
      'await import("./esm/mod.js");',
      'await import("./esm/assertion.js");',
      'await import("./esm/attestation.js");',
      'await import("./esm/supabase.js");',
    ].join(" "),
  ],
  cwd: "npm",
}).outputSync();
if (!smoke.success) {
  console.error(new TextDecoder().decode(smoke.stderr));
  console.error("Smoke import of built npm entries failed");
  Deno.exit(1);
}
console.log("Smoke import of built npm entries OK");
