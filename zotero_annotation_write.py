"""Use the existing zotero-cli local authorization for typed annotations."""
import json
import sys
from annotation_conflicts import ensure_comment_not_shorter,LocalCommentConflict
from sync_protection import annotation_snapshot,merge_annotation,check_deletion,SnapshotConflict
from annotation_geometry import native_position,ink_bounds

def create_payload(spec,rects,page_label,sort_index):
    payload={
        'itemType':'annotation','parentItem':spec['key'],'annotationType':spec['type'],
        'annotationText':spec['text'],'annotationComment':spec['comment'],
        'annotationColor':spec['color'],'annotationPageLabel':page_label,
        'annotationSortIndex':sort_index,
        'annotationPosition':json.dumps(native_position(spec,rects)),
        'tags':[{'tag':tag} for tag in spec.get('tags',[])],
    }
    if spec['type']=='ink':payload.pop('annotationText',None)
    if spec.get('annotation_key'): payload.update(key=spec['annotation_key'],version=0)
    return payload

def write_existing(client,item,spec):
    data=item['data']
    if data.get('itemType')!='annotation': raise ValueError('目标不是标注')
    if spec.get('key') and data.get('parentItem')!=spec['key']:raise ValueError('标注不属于当前附件')
    if spec['operation']=='delete':
        check_deletion(spec.get('base'),data)
        verify_revision(spec)
        if not client.delete_item(item):raise ValueError('Zotero 未确认删除成功')
        return {'key':spec['id']}
    merged=merge_annotation(spec.get('base'),data,spec)
    if (merged['type']=='ink')!=(annotation_snapshot(data)['type']=='ink'):raise SnapshotConflict('手写和文字标注不能互相转换',reason='annotation_type_changed')
    data['annotationComment']=merged['comment'];data['annotationColor']=merged['color'];data['annotationType']=merged['type']
    old_tags={tag['tag']:tag for tag in data.get('tags',[]) if isinstance(tag,dict)}
    data['tags']=[old_tags.get(tag,{'tag':tag}) for tag in merged['tags']]
    item['data']={**{k:data[k] for k in ('key','version','itemType','parentItem','annotationType') if k in data},**data}
    verify_revision(spec)
    if not client.update_item(item): raise ValueError('Zotero 未确认标注更新成功')
    return {'key':spec['id'],'base':annotation_snapshot(data)}

def verify_revision(spec):
    if spec.get('path') and spec.get('pdf_revision'):
        import hashlib
        from pathlib import Path
        with Path(spec['path']).open('rb') as file:revision=hashlib.file_digest(file,'sha256').hexdigest()
        if revision!=spec['pdf_revision']:raise SnapshotConflict('同步前 PDF 已变化，已暂停写入',reason='pdf_changed')

def main():
    from zotero_mcp.cli import setup_zotero_environment
    from zotero_mcp.client import get_local_write_client
    setup_zotero_environment()
    client=get_local_write_client()
    if client is None: raise ValueError('Zotero 本地写入授权不可用，标注保留在缓存中')
    spec=json.load(sys.stdin)
    verify_revision(spec)
    if spec.get('operation') in ('update','delete'):
        from pyzotero.errors import ResourceNotFoundError
        try:item=client.item(spec['id'])
        except ResourceNotFoundError:
            if spec['operation']=='delete':return {'key':spec['id']}
            raise SnapshotConflict('本地标注已被删除，网页草稿仍保留',base=spec.get('base'),reason='annotation_deleted')
        return write_existing(client,item,spec)
    position=spec['position']
    rects=[ink_bounds(position)] if spec['type']=='ink' else [[min(r[0],r[2]),min(r[1],r[3]),max(r[0],r[2]),max(r[1],r[3])] for r in position['rects']]
    expected=native_position(spec,rects)
    native_key=spec.get('annotation_key')
    if native_key:
        from pyzotero.errors import ResourceNotFoundError
        try: existing=client.item(native_key)['data']
        except ResourceNotFoundError: existing=None
        if existing:
            previous=json.loads(existing.get('annotationPosition','{}'))
            if existing.get('itemType')!='annotation' or existing.get('parentItem')!=spec['key'] or any(previous.get(k)!=v for k,v in expected.items()): raise ValueError('标注编号冲突，已保留草稿以供检查')
            original=annotation_snapshot(existing);desired=annotation_snapshot(spec)
            if any(original[field]!=desired[field] for field in ('comment','color','type','tags')):
                return write_existing(client,{'data':existing},{**spec,'operation':'update','id':native_key,'base':spec.get('base') or desired})
            return {'key':native_key}
    import fitz
    from zotero_mcp.pdf_utils import _build_sort_index,get_page_label
    with fitz.open(spec['path']) as document:
        sort_index=_build_sort_index(document[position['pageIndex']],position['pageIndex'],rects)
        page_label=get_page_label(document,spec['page'])
    payload=create_payload(spec,rects,page_label,sort_index)
    verify_revision(spec)
    result=client.create_items([payload])
    key=(result.get('success') or {}).get('0')
    if not key: raise ValueError('Zotero 未确认创建成功：'+str(result.get('failed') or result)[:300])
    return {'key':key}


if __name__=='__main__':
    try: print(json.dumps({'ok':True,**main()},ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok':False,'error':str(error)[:500],'conflict':'snapshot' if isinstance(error,SnapshotConflict) else 'local_comment_longer' if isinstance(error,LocalCommentConflict) else None,'details':getattr(error,'details',None)},ensure_ascii=False));sys.exit(1)
