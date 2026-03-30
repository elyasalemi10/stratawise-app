import { Font } from "@react-pdf/renderer";

/**
 * Register Nunito Sans for PDF documents.
 * Clean, modern sans-serif similar to Wave Accounting's style.
 */
Font.register({
  family: "NunitoSans",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/nunitosans/v15/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4GVilntF9kA_Yh.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/nunitosans/v15/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4G1ClntF9kA_Yh.ttf",
      fontWeight: 600,
    },
    {
      src: "https://fonts.gstatic.com/s/nunitosans/v15/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp5F5bxqqtQ1yiU4G7SlntF9kA_Yh.ttf",
      fontWeight: 700,
    },
  ],
});
