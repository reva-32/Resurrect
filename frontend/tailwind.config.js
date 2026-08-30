export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F1115",
        paper: "#FAFAF8",
        panel: "#14171F",
        accent: "#2B6CB0",
        accent2: "#6C4FD9",
        risk: "#C24444",
        recovered: "#2F7A4F",
        gold: "#D9A73B",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,17,21,0.04), 0 8px 24px -8px rgba(15,17,21,0.10)",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
