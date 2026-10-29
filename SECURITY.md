# Security

ZE is intended for a private, single-user Zotero library. Set your own passphrase during installation. Public access should use HTTPS; Cloudflare Access can provide an additional login layer.

Do not expose Zotero's local API directly. ZE listens on loopback by default. Keep the host, ZE and Zotero running when accessing the library from another device.

Passphrase hashes, trusted-device sessions, browser drafts, `reader-data.sqlite`, `.env`, `bridge.token`, generated XPI files and backups are private. Do not attach them to issues. When reporting a problem, use a synthetic document and remove credentials, paths and library details from logs and screenshots.

Translation sends the selected text to the provider you choose. Offline drafts remain on your browser or host; clearing browser data can remove drafts that have not reached the host.

Report a suspected vulnerability through the repository's private vulnerability reporting feature when available. Do not post credentials or private library data in public issues.
