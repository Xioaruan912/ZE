import sqlite3
import tempfile
import unittest
from pathlib import Path
from reading_state import save_progress, get_progress, list_progress

class ProgressTests(unittest.TestCase):
    def test_migrates_page_only_progress_and_preserves_precise_position(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.sqlite'
            with sqlite3.connect(path) as con:
                con.execute('CREATE TABLE progress (key TEXT PRIMARY KEY,page INTEGER NOT NULL)')
                con.execute("INSERT INTO progress VALUES ('ABCDEFGH',7)")
            con.close()
            self.assertEqual(get_progress('ABCDEFGH',path)['page'],7)
            save_progress({'key':'ABCDEFGH','page':8,'fraction':.65,'x':.4,'zoom_mode':'width','scale':1.2,'attachment':'12345678','title':'Paper'},path)
            result=get_progress('ABCDEFGH',path)
            self.assertEqual((result['page'],result['fraction'],result['x']),(8,.65,.4))
            self.assertEqual(list_progress(path)['ABCDEFGH']['title'],'Paper')
            self.assertGreater(result['updated'],0)

    def test_invalid_offsets_are_rejected_without_overwriting(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'state.sqlite'
            save_progress({'key':'ABCDEFGH','page':2},path)
            for fraction in (float('nan'),-1,1.2):
                with self.assertRaises(ValueError): save_progress({'key':'ABCDEFGH','page':3,'fraction':fraction},path)
            self.assertEqual(get_progress('ABCDEFGH',path)['page'],2)
