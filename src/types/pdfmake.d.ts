declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    addFonts(fonts: Record<string, Record<string, string>>): void;
    createPdf(doc: unknown): { getBlob(): Promise<Blob>; getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}
