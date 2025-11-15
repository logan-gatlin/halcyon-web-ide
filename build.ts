await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./dist"
});

await Bun.write(
  "./dist/halcyon_lib_bg.wasm",
  Bun.file("./src/halcyon_lib_bg.wasm")
);

await Bun.write(
  "./dist/favicon.png",
  Bun.file("./favicon.png"),
);
