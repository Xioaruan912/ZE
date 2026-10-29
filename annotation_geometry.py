"""Bounded native vector-ink geometry; never modifies the source PDF."""
import math

def validate_ink_position(position,page):
    if not isinstance(position,dict) or type(position.get('pageIndex')) is not int or position['pageIndex']!=page-1:raise ValueError('无效的手写页码')
    width=position.get('width')
    if type(width) not in (int,float) or not math.isfinite(width) or not 0<width<=20:raise ValueError('无效的笔迹粗细')
    paths=position.get('paths')
    if not isinstance(paths,list) or not 1<=len(paths)<=128:raise ValueError('无效的笔迹路径')
    count=0
    for path in paths:
        if not isinstance(path,list) or len(path)<2 or len(path)%2:raise ValueError('笔迹坐标必须成对')
        count+=len(path)
        if count>2400:raise ValueError('单条笔迹过长，请分段保存')
        if any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>1000000 for v in path):raise ValueError('无效的笔迹坐标')
    return {'pageIndex':position['pageIndex'],'width':width,'paths':[list(p) for p in paths]}

def ink_bounds(position):
    xs=[p[i] for p in position['paths'] for i in range(0,len(p),2)];ys=[p[i] for p in position['paths'] for i in range(1,len(p),2)];pad=position['width']/2
    return [min(xs)-pad,min(ys)-pad,max(xs)+pad,max(ys)+pad]

def native_position(spec,rects):
    if spec['type']=='ink':return validate_ink_position(spec['position'],spec['position']['pageIndex']+1)
    return {'pageIndex':spec['position']['pageIndex'],'rects':rects}
