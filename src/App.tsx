import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, Check, ClipboardList, RotateCcw, Download, Moon, SunMedium, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Subway 매장 운영용 단일 페이지 앱 (이미지 표 구조 반영, 동적 항목 추가/삭제)
 * 탭: 마감비품, 미트해동, 재료준비(미트), 빵해동, 마감시트, 마감체크리스트
 * 날짜별 로컬 스토리지 자동 저장, JSON 내보내기, 다크모드, 인쇄
 *
 * 계산 규칙(자동):
 * - 마감비품: 필요 = max(기준 - 현재, 0)
 * - 미트해동: 필요 = max(기준 - 현재, 0)
 * - 재료준비: 총계 = 유니트% + 팩빙 + 워크인, 필요 = max(기준 - 총계, 0)
 * - 빵해동: 필요개수 = max(저녁사용평균 - (현재고 + 2차중간재고), 0)
 *           필요해동개수 = max(다음날평균사용량 - 해동, 0)
 * - 마감시트: (1)+(2)+(3)=총합금액, 차액 = 입금(지폐입금합계) - 총합금액
 */

// 유틸
const uid = () => Math.random().toString(36).slice(2, 9);
const toISO = (d) => {
  if (typeof d === "string") return d;
  const tz = new Date().getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
};
const n = (v) => (typeof v === "number" ? v : Number(v || 0));

// 기본 템플릿 (이미지 표 기반 기본 항목)
const DEFAULTS = {
  supplies: [
    "음료컵(16oz)", "음료뚜껑", "라떼일회컵", "키친타올", "숟가락", "포크", "나이프", "포장지",
    "쿠키봉투", "아이스컵+플라스틱", "아이스뚜껑+플라스틱", "롯데컵(12oz)", "시럽병뚜껑",
    "소+새빨종이봉투", "초코빨종이봉투", "스프컵", "스프뚜껑", "종이쿠키백(6개입)",
    "쿠키박스", "증지(소스콜라)", "증지뚜껑", "테이프", "계량컵", "컬러터",
    "샐러드볼", "샐러드뚜껑", "음료봉투",
  ].map((name, i) => ({ id: uid(), name, 기준: [3,3,5,10,2,2,2,3,2,1,1,1,2,2,2,1,1,6,1,1,1,1,1,1,1,1][i] || 0, 현재: 0 })),
  thaw: [
    ["치킨스트립",3],["치킨패티",3],["풀드포크",4],["로티세리",4],["스테이크",6],["안창베프",10],
    ["터키",6],["햄",6],["2/3패티 한장",42],["머쉬룸",6],["쉬림프",8],["페퍼로니",4],["살라미",4],
    ["베이컨",2],["아보카도",24],["수프",3],["오믈렛",2],["베슬",1]
  ].map(([name, 기준]) => ({ id: uid(), name, 기준, 현재: 0 })),
  prep: [
    ["치즈",4],["모짜렐라",4],["슈레드",6],["터키",3],["햄",4],["치킨패티",4],["베이컨",5],
    ["쉬림프",4],["스파이시",2],["스테이크",3],["로티세리",3],["풀드포크",2],["살라미",4],
    ["페퍼로니",4],["참치",2],["에그마요",8],["데리야끼",1],["안창",2],["머쉬룸",2],
    ["아보카도",2],["피클",5],["올리브",5],["할라피뇨",5]
  ].map(([name, 기준]) => ({ id: uid(), name, 기준, 유니트: 0, 팩빙: 0, 워크인: 0 })),
  bread: ["파마산","허니오트","위트","화이트","하티","플랫"].map((name)=>({ id: uid(), name, 현재고: 0, 중간재고: 0, 저녁평균: 0, 필요개수: 0, 다음날평균: 0, 해동: 0, 필요해동개수: 0 })),
  closing: {
    zones: [
      { id: uid(), 구역: "지하", 품목: "샐러드볼", 단위: "bag" },
      { id: uid(), 구역: "지하", 품목: "피클", 단위: "bag" },
      { id: uid(), 구역: "지상", 품목: "토마토", 단위: "box" },
      { id: uid(), 구역: "지상", 품목: "생지", 단위: "tray" },
      { id: uid(), 구역: "캡보틀", 품목: "피클", 단위: "BAG" },
      { id: uid(), 구역: "캡보틀", 품목: "오이", 단위: "BAG" },
      { id: uid(), 구역: "캡보틀", 품목: "토마토", 단위: "BOX" },
      { id: uid(), 구역: "캡보틀", 품목: "양파", 단위: "BAG" },
      { id: uid(), 구역: "관계잡", 품목: "양상추", 단위: "Bag/box" },
    ],
    cash: { cash: 0, card: 0, exchange: 0, total: 0, deposit: 0, diff: 0, meal: 0, reissue: 0 },
    memo: ""
  },
  checklist: [
    "소스마감","전자레인지 마감","쿠키마감","유니트 밑 선반 청소","유니트 유리 닦기","오븐기, 발효기 마감",
    "소스 채우기","비품 채우기","비품 가져오기","커피마감 + 커피물통","백냉 음료 채우기","핫웰 마감",
    "매장청소","유니트끄기","쓰레기통 합치기","백냉 빼기","음료 마감","스쿱 걷기","도마 및 빵칼 설거지","유니트 마감"
  ].map((t)=>({ id: uid(), text: t, done: false })),
};

function useDailyStore(date) {
  const key = `subway:${date}`;
  const [state, setState] = useState(() => {
    const raw = localStorage.getItem(key);
    if (raw) try { return JSON.parse(raw); } catch {}
    return DEFAULTS;
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [state, key]);
  return [state, setState];
}

export default function App(){
  const today = useMemo(() => toISO(new Date()), []);
  const [date, setDate] = useState(today);
  const [state, setState] = useDailyStore(date);
  const [dark, setDark] = useState(() => localStorage.getItem("prefers-dark") === "1");

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("prefers-dark", dark?"1":"0"); }, [dark]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `subway-${date}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const resetDay = () => { if(confirm("이 날짜 데이터를 초기화할까요?")) setState(DEFAULTS); };
  const printPage = () => window.print();

  // 집계
  const suppliesNeed = state.supplies.reduce((s,x)=>s + Math.max(0, n(x.기준) - n(x.현재)), 0);
  const thawNeed = state.thaw.reduce((s,x)=>s + Math.max(0, n(x.기준) - n(x.현재)), 0);
  const prepNeed = state.prep.reduce((s,x)=>{ const total=n(x.유니트)+n(x.팩빙)+n(x.워크인); return s + Math.max(0, n(x.기준) - total); }, 0);
  const breadNeed = state.bread.reduce((s,x)=>s + Math.max(0, n(x.저녁평균) - (n(x.현재고)+n(x.중간재고))), 0);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">써브웨이 준비/해동/마감</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="w-[150px]"/>
          <Button variant="outline" onClick={exportJSON}><Download className="h-4 w-4 mr-1"/>내보내기</Button>
          <Button variant="outline" onClick={printPage}><Printer className="h-4 w-4 mr-1"/>인쇄</Button>
          <Button variant="destructive" onClick={resetDay}><RotateCcw className="h-4 w-4 mr-1"/>초기화</Button>
          <Moon className={cn("h-4 w-4", dark?"opacity-100":"opacity-40")} />
          <Switch checked={dark} onCheckedChange={setDark}/>
          <SunMedium className={cn("h-4 w-4", !dark?"opacity-100":"opacity-40")} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 mb-4">
        <Stat title="비품 필요" value={suppliesNeed} note="필요 총합"/>
        <Stat title="미트해동 필요" value={thawNeed} note="필요 총합"/>
        <Stat title="재료준비 필요" value={prepNeed} note="필요 총합"/>
        <Stat title="빵 필요개수" value={breadNeed} note="저녁대비 부족"/>
      </div>

      <Tabs defaultValue="supplies">
        <TabsList className="grid grid-cols-6">
          <TabsTrigger value="supplies">마감비품</TabsTrigger>
          <TabsTrigger value="thaw">미트해동</TabsTrigger>
          <TabsTrigger value="prep">재료준비</TabsTrigger>
          <TabsTrigger value="bread">빵해동</TabsTrigger>
          <TabsTrigger value="closing">마감시트</TabsTrigger>
          <TabsTrigger value="checklist">체크리스트</TabsTrigger>
        </TabsList>

        {/* 마감비품표 */}
        <TabsContent value="supplies">
          <ComputedTable
            title="마감비품표"
            cols={[{k:"name",label:"비품",type:"text"},{k:"기준",label:"기준",type:"number"},{k:"현재",label:"현재",type:"number"},{k:"필요",label:"필요",type:"computed",compute:(row)=>Math.max(0, n(row.기준)-n(row.현재))}]}
            items={state.supplies}
            onChange={(items)=>setState({...state, supplies: items})}
          />
        </TabsContent>

        {/* 미트 해동표 */}
        <TabsContent value="thaw">
          <ComputedTable
            title="미트 해동표"
            cols={[{k:"name",label:"해동",type:"text"},{k:"기준",label:"기준",type:"number"},{k:"현재",label:"현재",type:"number"},{k:"필요",label:"필요",type:"computed",compute:(row)=>Math.max(0, n(row.기준)-n(row.현재))}]}
            items={state.thaw}
            onChange={(items)=>setState({...state, thaw: items})}
          />
        </TabsContent>

        {/* 미트 재료준비표 */}
        <TabsContent value="prep">
          <ComputedTable
            title="미트 재료준비표"
            cols={[
              {k:"name",label:"스쿱표",type:"text"},
              {k:"기준",label:"기준",type:"number"},
              {k:"유니트",label:"유니트%",type:"number"},
              {k:"팩빙",label:"팩빙",type:"number"},
              {k:"워크인",label:"워크인",type:"number"},
              {k:"총계",label:"총계",type:"computed",compute:(row)=>n(row.유니트)+n(row.팩빙)+n(row.워크인)},
              {k:"필요",label:"필요",type:"computed",compute:(row)=>Math.max(0, n(row.기준)-(n(row.유니트)+n(row.팩빙)+n(row.워크인)))}
            ]}
            items={state.prep}
            onChange={(items)=>setState({...state, prep: items})}
          />
        </TabsContent>

        {/* 빵 해동표 */}
        <TabsContent value="bread">
          <ComputedTable
            title="빵 해동표"
            cols={[
              {k:"name",label:"빵",type:"text"},
              {k:"현재고",label:"현재고",type:"number"},
              {k:"중간재고",label:"2차중간재고",type:"number"},
              {k:"저녁평균",label:"저녁사용평균",type:"number"},
              {k:"필요개수",label:"필요개수",type:"computed",compute:(row)=>Math.max(0, n(row.저녁평균) - (n(row.현재고)+n(row.중간재고)))},
              {k:"다음날평균",label:"다음날평균사용량",type:"number"},
              {k:"해동",label:"해동",type:"number"},
              {k:"필요해동개수",label:"필요해동개수",type:"computed",compute:(row)=>Math.max(0, n(row.다음날평균) - n(row.해동))},
            ]}
            items={state.bread}
            onChange={(items)=>setState({...state, bread: items})}
          />
        </TabsContent>

        {/* 마감시트표 */}
        <TabsContent value="closing">
          <Card className="mb-4">
            <CardHeader><CardTitle>마감시트 — 구역별 품목</CardTitle></CardHeader>
            <CardContent>
              <SimpleTable
                cols={[{k:"구역",label:"구역"},{k:"품목",label:"품목"},{k:"단위",label:"단위"}]}
                items={state.closing.zones}
                onChange={(items)=>setState({...state, closing:{...state.closing, zones: items}})}
              />
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader><CardTitle>현금 정리</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <NumberRow label="(1) 현금매출" value={state.closing.cash.cash} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, cash:v}}})}/>
              <NumberRow label="(2) 카드매출" value={state.closing.cash.card} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, card:v}}})}/>
              <NumberRow label="(3) 교환교품" value={state.closing.cash.exchange} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, exchange:v}}})}/>
              <ReadOnlyRow label="(1+2+3) 총합금액" value={state.closing.cash.cash + state.closing.cash.card + state.closing.cash.exchange}/>
              <NumberRow label="지폐 입금 합계" value={state.closing.cash.deposit} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, deposit:v}}})}/>
              <ReadOnlyRow label="차액(입금-총합)" value={state.closing.cash.deposit - (state.closing.cash.cash + state.closing.cash.card + state.closing.cash.exchange)}/>
              <NumberRow label="식권" value={state.closing.cash.meal} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, meal:v}}})}/>
              <NumberRow label="재외/재고" value={state.closing.cash.reissue} onChange={(v)=>setState({...state, closing:{...state.closing, cash:{...state.closing.cash, reissue:v}}})}/>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>메모</CardTitle></CardHeader>
            <CardContent>
              <Textarea placeholder="특이사항, 발주, 파손 등" value={state.closing.memo} onChange={(e)=>setState({...state, closing:{...state.closing, memo:e.target.value}})} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* 마감 체크리스트 */}
        <TabsContent value="checklist">
          <Card>
            <CardHeader><CardTitle>마감 체크리스트</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {state.checklist.map((it,i)=> (
                <div key={it.id} className="flex items-center gap-2">
                  <Button size="icon" variant={it.done?"default":"outline"} onClick={()=>{
                    const next=[...state.checklist]; next[i]={...it, done:!it.done}; setState({...state, checklist: next});
                  }}><Check className="h-4 w-4"/></Button>
                  <Input value={it.text} onChange={(e)=>{
                    const next=[...state.checklist]; next[i]={...it, text:e.target.value}; setState({...state, checklist: next});
                  }}/>
                  <Button size="icon" variant="ghost" onClick={()=>{
                    const next=[...state.checklist]; next.splice(i,1); setState({...state, checklist: next});
                  }}><Trash2 className="h-4 w-4"/></Button>
                </div>
              ))}
              <div className="pt-2 flex justify-end">
                <Button onClick={()=>setState({...state, checklist:[...state.checklist,{id:uid(), text:"새 항목", done:false}]})}><Plus className="h-4 w-4 mr-1"/>항목 추가</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <footer className="text-center text-xs text-muted-foreground py-6">날짜별 자동 저장 · 단일 파일 데모</footer>
    </div>
  );
}

/** 공용 컴포넌트 **/
function Stat({ title, value, note }){
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </CardContent>
    </Card>
  );
}

function SimpleTable({ cols, items, onChange }){
  const patch=(i,k,v)=>{ const next=[...items]; next[i]={...next[i],[k]:v}; onChange(next); };
  const remove=(i)=>{ const next=[...items]; next.splice(i,1); onChange(next); };
  const add=()=>{ const base={ id:uid() }; cols.forEach(c=>{ base[c.k] = c.k === 'name' ? '새 항목' : ''; }); onChange([...items, base]); };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {cols.map(c=> <th key={c.k} className="text-left px-2 py-1">{c.label}</th>)}
            <th className="w-10"/>
          </tr>
        </thead>
        <tbody>
          {items.map((it,i)=> (
            <tr key={it.id} className="border-t">
              {cols.map(c=> (
                <td key={c.k} className="px-2 py-1">
                  <Input value={it[c.k]??""} onChange={(e)=>patch(i,c.k,e.target.value)} />
                </td>
              ))}
              <td className="text-right"><Button size="icon" variant="ghost" onClick={()=>remove(i)}><Trash2 className="h-4 w-4"/></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-end"><Button onClick={add}><Plus className="h-4 w-4 mr-1"/>추가</Button></div>
    </div>
  );
}

function ComputedTable({ title, cols, items, onChange }){
  const patch=(i,k,v)=>{ const next=[...items]; next[i]={...next[i],[k]:v}; onChange(next); };
  const remove=(i)=>{ const next=[...items]; next.splice(i,1); onChange(next); };
  const add=()=>{ const base={ id:uid(), name:"새 항목" }; cols.forEach(c=>{ if(c.type!=="computed" && c.k!=="name") base[c.k]=0; }); onChange([...items, base]); };
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {cols.map(c=> <th key={c.k} className="text-left px-2 py-1">{c.label}</th>)}
              <th className="w-10"/>
            </tr>
          </thead>
          <tbody>
            {items.map((it,i)=> (
              <tr key={it.id} className="border-t">
                {cols.map(c=> (
                  <td key={c.k} className="px-2 py-1 align-top">
                    {c.type === 'computed' ? (
                      <div className="px-3 py-2 border rounded bg-muted/40">{(c.compute?.(it) ?? 0)}</div>
                    ) : (
                      <Input type={c.type==='number'? 'number': 'text'} value={it[c.k]??(c.type==='number'?0:'')} onChange={(e)=>patch(i,c.k, c.type==='number'? Number(e.target.value||0) : e.target.value)} />
                    )}
                  </td>
                ))}
                <td className="text-right"><Button size="icon" variant="ghost" onClick={()=>remove(i)}><Trash2 className="h-4 w-4"/></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-end"><Button onClick={add}><Plus className="h-4 w-4 mr-1"/>행 추가</Button></div>
      </CardContent>
    </Card>
  );
}

function NumberRow({ label, value, onChange }){
  return (
    <div className="flex items-center gap-2">
      <div className="w-40 text-sm text-muted-foreground">{label}</div>
      <Input type="number" value={value} onChange={(e)=>onChange(Number(e.target.value||0))} />
    </div>
  );
}
function ReadOnlyRow({ label, value }){
  return (
    <div className="flex items-center gap-2">
      <div className="w-40 text-sm text-muted-foreground">{label}</div>
      <div className="px-3 py-2 border rounded bg-muted/40 w-full">{value}</div>
    </div>
  );
}
