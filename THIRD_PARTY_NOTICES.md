# Third-party components

ZE is licensed under AGPL-3.0-only. Dependencies retain their own licenses.

| Component | License | Project |
| --- | --- | --- |
| Zotero MCP / zotero-cli | MIT | https://github.com/54yyyu/zotero-mcp |
| PyMuPDF / MuPDF | AGPL-3.0 or commercial | https://pymupdf.readthedocs.io/en/latest/about.html#license-and-copyright |
| cryptography | Apache-2.0 or BSD-3-Clause | https://github.com/pyca/cryptography |
| python-dotenv | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| PDF.js | Apache-2.0 | https://github.com/mozilla/pdf.js |
| Motion, Framer Motion, motion-dom, motion-utils | MIT | https://github.com/motiondivision/motion |
| Phosphor Icons | MIT | https://github.com/phosphor-icons/core |
| IBM Plex Sans | SIL Open Font License 1.1 | https://github.com/IBM/plex |
| esbuild (build tool) | MIT | https://github.com/evanw/esbuild |
| Translate for Zotero (optional, installed separately) | AGPL-3.0 | https://github.com/windingwind/zotero-pdf-translate |

Python and Node.js packages are downloaded during installation; their complete notices remain in the installed packages. Frontend runtime license texts are also collected into `static/build/ZE-LICENSES.txt` when building.

The PDF.js worker is modified during the build to export the PDF font cap-height metric alongside ascent and descent. This modification is implemented in `scripts/build-frontend.mjs`; the upstream package is kept intact. PDF.js is Copyright Mozilla Foundation and contributors and is used under Apache-2.0.

Screenshots use the project's synthetic demonstration document. No personal Zotero database, PDF attachment, credentials, built private bridge or recovery backup is distributed.

Zotero, CNKI, Google and Microsoft names belong to their respective owners. ZE is an independent project.
