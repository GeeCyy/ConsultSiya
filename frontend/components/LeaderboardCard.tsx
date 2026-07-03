'use client';

export type LeaderboardItem = {
  rank: number;
  label: string;
  count: number;
};

type Props = {
  title: string;
  items: LeaderboardItem[];
  highlight?: string;
  isDark?: boolean;
  compact?: boolean;
};

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardCard({ title, items, highlight, isDark = true, compact = false }: Props) {
  const cardBg    = isDark
    ? 'bg-[#252535] border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.60),0_4px_12px_rgba(0,0,0,0.40)]'
    : 'bg-white border-sky-100 shadow-[0_10px_40px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]';
  const divider   = isDark ? 'divide-white/5'               : 'divide-gray-100';
  const headerBdr = isDark ? 'border-white/5'               : 'border-gray-100';
  const tp        = isDark ? 'text-white'                   : 'text-gray-900';
  const tm        = isDark ? 'text-gray-500'                : 'text-gray-500';
  const ts        = isDark ? 'text-gray-300'                : 'text-gray-700';
  const rowHover  = isDark ? 'hover:bg-white/[0.02]'        : 'hover:bg-gray-50';
  const hlBg      = isDark ? 'bg-amber-500/10'              : 'bg-amber-50';
  const hlText    = isDark ? 'text-amber-300'               : 'text-amber-700';

  const headerPad = compact ? 'px-3 py-2'   : 'px-5 py-3.5';
  const rowPad    = compact ? 'px-3 py-1'   : 'px-5 py-2.5';
  const rowGap    = compact ? 'gap-2'       : 'gap-3';
  const textSize  = compact ? 'text-xs'     : 'text-sm';
  const medalSize = compact ? 'text-sm'     : 'text-base';
  const emptyPy   = compact ? 'py-4'        : 'py-10';

  return (
    <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
      <div className={`${headerPad} border-b ${headerBdr}`}>
        <p className={`text-sm font-semibold ${tp}`}>{title}</p>
      </div>
      {items.length === 0 ? (
        <div className={`flex items-center justify-center ${emptyPy}`}>
          <p className={`text-sm ${tm}`}>No data yet</p>
        </div>
      ) : (
        <div className={`divide-y ${divider}`}>
          {items.map((item, i) => {
            const isHighlighted = !!highlight && item.label === highlight;
            return (
              <div
                key={item.rank}
                className={`flex items-center ${rowGap} ${rowPad} ${isHighlighted ? hlBg : rowHover}`}
              >
                <span className="w-5 flex-shrink-0 text-center">
                  {i < 3
                    ? <span className={`${medalSize} leading-none`}>{MEDALS[i]}</span>
                    : <span className={`text-xs font-bold ${tm}`}>{item.rank}</span>
                  }
                </span>
                <span className={`flex-1 ${textSize} font-medium truncate ${isHighlighted ? hlText : ts}`}>
                  {item.label}
                  {isHighlighted && (
                    <span className={`ml-1 text-[10px] font-semibold ${hlText} opacity-70`}>(you)</span>
                  )}
                </span>
                <span className={`${textSize} font-bold flex-shrink-0 tabular-nums ${isHighlighted ? hlText : tp}`}>
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
