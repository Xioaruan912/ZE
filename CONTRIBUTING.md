# Contributing

Use Python 3.12 and Node.js 22 or newer. Install `requirements.txt` in a virtual environment, then run `npm ci` and `npm run build`.

Run the checks before opening a pull request:

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

For UI checks, run `python tests/run_reader_fixture.py` and open `http://127.0.0.1:8767/responsive.html`. This uses a synthetic PDF and isolated, in-memory API responses; it does not write to your Zotero library. Use “Run device matrix” for phone, iPad and desktop scenarios. Physical Apple Pencil behavior needs real-device testing.

Never commit `.env`, passphrases, tokens, databases, PDF attachments, machine-bound XPI packages, logs or recovery backups. Bridge packages are built separately for each user's machine and must not be published as shared releases.

The reviewed `plugins/reading-columns/reading-route-columns.xpi` is a shareable exception: its reproducible builder includes only three runtime source files and no machine credentials. Rebuild it with `python plugins/reading-columns/build.py` after changing those sources. Plugin usage and configuration are documented in `plugins/reading-columns/README.md`.
