import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: any) {
  if (!date) return '';
  let d: Date;
  if (date.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else if (date && typeof date.seconds === 'number') {
    d = new Date(date.seconds * 1000);
  } else if (typeof date === 'string' || typeof date === 'number') {
    d = new Date(date);
  } else if (date instanceof Date) {
    d = date;
  } else {
    return String(date);
  }
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      cell = cell.replace(/"/g, '""');
      return `"${cell}"`;
    }).join(',')
  );
  
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
