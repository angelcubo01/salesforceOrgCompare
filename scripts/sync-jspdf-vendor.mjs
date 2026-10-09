#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, '..', 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js');
const destination = resolve(root, '..', 'vendor', 'jspdf', 'jspdf.umd.min.js');

const remotePdfObjectPattern = /case"pdfobjectnewwindow":if\("\[object Window\]"===Object\.prototype\.toString\.call\(i\)\)\{var a="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject\/2\.1\.1\/pdfobject\.min\.js",o=!e\.pdfObjectUrl;o\|\|\(a=e\.pdfObjectUrl\);var h=i\.open\(\);if\(null!==h\)\{var l=Ie\(h\),c=l\.document\.createElement\("script"\),u=this;c\.src=a,o&&\(c\.integrity="sha512-4ze\/a9\/4jqu\+tX9dfOqJYSvyYd5M6qum\/3HpCLr\+\/Jqf0whc37VUbkpNGHR7\/8pSnCFw47T1fmIpwBV7UySh3g==",c\.crossOrigin="anonymous"\),c\.onload=function\(\)\{h\.PDFObject\.embed\(u\.output\("dataurlstring"\),e\)\},l\.body\.appendChild\(c\)\}return h\}throw new Error\("The option pdfobjectnewwindow just works in a browser-environment\."\);/;
const replacement = 'case"pdfobjectnewwindow":throw new Error("The option pdfobjectnewwindow is not supported in the extension build.");';

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

const bundle = await readFile(destination, 'utf8');
if (!remotePdfObjectPattern.test(bundle)) {
  throw new Error('No se encontro el cargador remoto de PDFObject esperado en jsPDF. Revisa la nueva version antes de empaquetar.');
}

const sanitizedBundle = bundle.replace(remotePdfObjectPattern, replacement);
if (/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject/i.test(sanitizedBundle)) {
  throw new Error('La sanitizacion de jsPDF no ha eliminado el cargador remoto de PDFObject.');
}

await writeFile(destination, sanitizedBundle, 'utf8');
console.log('[SFOC] jsPDF sincronizado sin el cargador remoto opcional de PDFObject.');
