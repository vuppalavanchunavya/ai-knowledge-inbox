declare module '@mozilla/readability' {
  export class Readability {
    constructor(document: object);
    parse(): { title: string; textContent: string } | null;
  }
}
