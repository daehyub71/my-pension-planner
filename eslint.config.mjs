import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "mcp/**", "data/**", "public/**"]),
  {
    // 엔진은 순수 TS다 (PLAN §1-3). React·Next·파서·화면·저장소를 끌어오면 빌드가 막힌다.
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "next", "next/*", "xlsx", "pdfjs-dist", "@/app/*", "@/components/*", "@/src/importers/*", "@/src/store/*", "../importers/*", "../store/*"],
              message: "src/engine은 순수 TS다. 화면·파서·저장소를 import하지 않는다 (PLAN §1-3).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
