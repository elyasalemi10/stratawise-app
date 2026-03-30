import { Font } from "@react-pdf/renderer";

/**
 * Register Nunito Sans for PDF documents.
 * Using static font files from fontsource CDN (react-pdf needs static .ttf, not variable fonts).
 */
Font.register({
  family: "NunitoSans",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-400-normal.ttf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-600-normal.ttf",
      fontWeight: 600,
    },
    {
      src: "https://cdn.jsdelivr.net/fontsource/fonts/nunito-sans@latest/latin-700-normal.ttf",
      fontWeight: 700,
    },
  ],
});
