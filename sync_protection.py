"""Three-way annotation merging using the content the reader actually saw."""
import hashlib
import json
from annotation_conflicts import LocalCommentConflict,ensure_comment_not_shorter

def tag_names(tags):
    if not isinstance(tags,list): raise ValueError('标注标签必须是列表')
    values=[tag.get('tag','') if isinstance(tag,dict) else tag for tag in tags]
    if any(not isinstance(value,str) for value in values):raise ValueError('标签必须是文字')
    names=sorted({value.strip() for value in values})
    if len(names)>40 or any(not isinstance(name,str) or len(name)>100 or '\n' in name for name in names): raise ValueError('标签最多 40 个，每个不超过 100 字')
    return [name for name in names if name]

def annotation_snapshot(annotation):
    position=annotation.get('annotationPosition',annotation.get('position',{}))
    if isinstance(position,str):position=json.loads(position)
    annotation_type=annotation.get('annotationType',annotation.get('type','highlight'))
    return {
        'comment':annotation.get('annotationComment',annotation.get('comment','')) or '',
        'color':annotation.get('annotationColor',annotation.get('color','#ffd400')),
        'type':'ink' if annotation_type in ('ink',4) else 'underline' if annotation_type in ('underline',5) else 'highlight',
        'tags':tag_names(annotation.get('tags',[])),
        'structure':hashlib.sha256(json.dumps([annotation.get('annotationText',annotation.get('text','')) or '',position],sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),
        'version':annotation.get('version',0),
    }

class SnapshotConflict(LocalCommentConflict):
    def __init__(self,message,base=None,local=None,web=None,fields=None,reason='content_changed'):
        super().__init__(message);self.details={'reason':reason,'base':base,'local':local,'web':web,'fields':fields or []}

def merge_annotation(base,local_annotation,edit):
    local=annotation_snapshot(local_annotation)
    desired={k:edit[k] for k in ('comment','color','type','tags') if k in edit and edit[k] is not None}
    if 'tags' in desired:desired['tags']=tag_names(desired['tags'])
    if not base:
        if all(local.get(k)==v for k,v in desired.items()):return local
        raise SnapshotConflict('缺少原始版本，已保留双方内容，请核对后重新保存',None,local,desired,reason='missing_baseline')
    try:ensure_comment_not_shorter(local['comment'],desired.get('comment',local['comment']))
    except LocalCommentConflict as error:raise SnapshotConflict(str(error),base,local,desired,['comment'],'local_comment_longer')
    conflicts=[];merged=dict(local)
    if base.get('structure')!=local['structure']:conflicts.append('position_or_text')
    for field,value in desired.items():
        original=base.get(field)
        if field=='tags':
            old=set(original or []);web=set(value);current=set(local['tags'])
            merged['tags']=sorted((current-(old-web))|(web-old));continue
        if value==original:continue
        if local[field]!=original and local[field]!=value:conflicts.append(field)
        else:merged[field]=value
    if conflicts:raise SnapshotConflict('本地与网页修改了同一处内容，已暂停覆盖并保留双方版本',base,local,desired,conflicts)
    return merged

def check_deletion(base,local_annotation):
    local=annotation_snapshot(local_annotation)
    if not base or any(base.get(k)!=local[k] for k in ('comment','color','type','tags','structure')):
        raise SnapshotConflict('标注已在本地变化，删除已暂停，请重新核对',base,local,{'delete':True},reason='delete_changed')
