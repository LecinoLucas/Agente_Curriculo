import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

function preserveGeneratedNodeSource() {
  return {
    postcssPlugin: "preserve-generated-node-source",
    Once(root) {
      const source = root.source;
      if (!source?.input?.file) return;

      root.walk((node) => {
        if (!node.source?.input?.file) {
          node.source = {
            input: source.input,
            start: source.start ?? { line: 1, column: 1 },
            end: source.end ?? { line: 1, column: 1 },
          };
        }
      });
    },
  };
}

export default {
  plugins: [tailwindcss(), autoprefixer(), preserveGeneratedNodeSource()],
};
