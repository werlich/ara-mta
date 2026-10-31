export class AnnotationHistory {
 constructor(limit=50){this.shapes=[];this.past=[];this.future=[];this.limit=limit;}
 commit(shapes){this.past.push(this.shapes);if(this.past.length>this.limit)this.past.shift();this.shapes=shapes;this.future=[];}
 add(shape){this.commit([...this.shapes,structuredClone(shape)]);}
 remove(id){if(this.shapes.some(s=>s.id===id))this.commit(this.shapes.filter(s=>s.id!==id));}
 update(id,shape){if(this.shapes.some(s=>s.id===id))this.commit(this.shapes.map(s=>s.id===id?structuredClone(shape):s));}
 clear(){if(this.shapes.length)this.commit([]);}
 undo(){if(!this.past.length)return;this.future.push(this.shapes);this.shapes=this.past.pop();}
 redo(){if(!this.future.length)return;this.past.push(this.shapes);this.shapes=this.future.pop();}
}
export function imagePoint(clientX,clientY,rect,width,height){return{x:Math.max(0,Math.min(width,(clientX-rect.left)*width/rect.width)),y:Math.max(0,Math.min(height,(clientY-rect.top)*height/rect.height))};}
export function arrowPath(a,b,head){const angle=Math.atan2(b.y-a.y,b.x-a.x);return `M ${a.x} ${a.y} L ${b.x} ${b.y} M ${b.x-head*Math.cos(angle-.5)} ${b.y-head*Math.sin(angle-.5)} L ${b.x} ${b.y} L ${b.x-head*Math.cos(angle+.5)} ${b.y-head*Math.sin(angle+.5)}`;}
export function shapeBounds(s){
 if(s.points?.length){const xs=s.points.map(p=>p.x),ys=s.points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(1,Math.max(...xs)-Math.min(...xs)),h:Math.max(1,Math.max(...ys)-Math.min(...ys))};}
 if(s.tool==='text'){const lines=s.text.split('\n');return{x:s.x,y:s.y-s.size,w:Math.max(s.size,Math.max(...lines.map(x=>x.length))*s.size*.63),h:Math.max(s.size,lines.length*s.size*1.25)};}
 return{x:s.x,y:s.y,w:Math.max(1,s.w),h:Math.max(1,s.h)};
}
export function moveShape(s,dx,dy){const copy=structuredClone(s);if(copy.points)copy.points=copy.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{copy.x+=dx;copy.y+=dy;}return copy;}
export function resizeShape(s,factor){factor=Math.max(.15,Math.min(6,factor));const b=shapeBounds(s),cx=b.x+b.w/2,cy=b.y+b.h/2,copy=structuredClone(s);
 if(copy.points)copy.points=copy.points.map(p=>({x:cx+(p.x-cx)*factor,y:cy+(p.y-cy)*factor}));
 else if(copy.tool==='text'){copy.size*=factor;copy.x=cx+(s.x-cx)*factor;copy.y=cy+(s.y-cy)*factor;}
 else{copy.w*=factor;copy.h*=factor;copy.x=cx-copy.w/2;copy.y=cy-copy.h/2;}
 return copy;
}
