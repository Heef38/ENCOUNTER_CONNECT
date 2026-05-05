interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
}

const COLOR_MAP = {
  blue:   'border-blue-200 bg-blue-50',
  green:  'border-green-200 bg-green-50',
  yellow: 'border-yellow-200 bg-yellow-50',
  red:    'border-red-200 bg-red-50',
  purple: 'border-purple-200 bg-purple-50',
  gray:   'border-gray-200 bg-gray-50',
};

const VALUE_COLOR_MAP = {
  blue:   'text-blue-700',
  green:  'text-green-700',
  yellow: 'text-yellow-700',
  red:    'text-red-700',
  purple: 'text-purple-700',
  gray:   'text-gray-700',
};

export function StatsCard({ title, value, subtitle, color = 'gray' }: StatsCardProps) {
  return (
    <div className={`rounded-lg border p-5 ${COLOR_MAP[color]}`}>
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${VALUE_COLOR_MAP[color]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}
