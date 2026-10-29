"""Protect richer desktop comments before writing web drafts back to Zotero."""
import re
from html.parser import HTMLParser


class LocalCommentConflict(ValueError):
    pass


class CommentText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[]
    def handle_data(self,data): self.parts.append(data)
    def handle_starttag(self,tag,attrs):
        if tag not in {'p','div','span','br','b','strong','i','em','u','s','sub','sup','ul','ol','li','a','code'}:
            self.parts.append(self.get_starttag_text())
    def handle_endtag(self,tag):
        if tag not in {'p','div','span','br','b','strong','i','em','u','s','sub','sup','ul','ol','li','a','code'}:
            self.parts.append('</'+tag+'>')


def comment_size(text):
    parser=CommentText();parser.feed(text or '');parser.close()
    return len(re.sub(r'\s+','',''.join(parser.parts)))


def ensure_comment_not_shorter(local_comment,web_comment):
    if comment_size(local_comment)>comment_size(web_comment):
        raise LocalCommentConflict('本地批注比网页批注更长，已跳过覆盖；网页草稿仍保存在缓存中')
