import { REQUEST_STATUS_LABELS, type RequestSummary } from '@portal/shared';
import { stringify } from 'csv-stringify/sync';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { DateTime } from 'luxon';

export const EXPORT_FORMATS = ['csv', 'docx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const COLUMNS = [
  'Código',
  'Título',
  'Categoria',
  'Solicitante',
  'Responsável',
  'Abertura',
  'Prazo',
  'Situação',
  'Fora do prazo',
];

// Uma linha da exportação, com as datas no fuso da empresa e os rótulos da tela.
function toRow(request: RequestSummary, timeZone: string): string[] {
  const date = (iso: string) =>
    DateTime.fromISO(iso, { zone: timeZone }).toFormat('dd/MM/yyyy HH:mm');
  return [
    request.code,
    request.title,
    request.category.name,
    request.requester.name,
    request.assignee?.name ?? '',
    date(request.createdAt),
    date(request.dueAt),
    REQUEST_STATUS_LABELS[request.status],
    request.overdue ? 'Sim' : 'Não',
  ];
}

// Ponto e vírgula e BOM: é o que o Excel em português abre direto, com os acentos certos.
export function toCsv(requests: RequestSummary[], timeZone: string): Buffer {
  const rows = requests.map((request) => toRow(request, timeZone));
  return Buffer.from(stringify([COLUMNS, ...rows], { delimiter: ';', bom: true }));
}

export function toDocx(requests: RequestSummary[], timeZone: string, now: Date): Promise<Buffer> {
  const cell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 16 })] })],
    });
  const generatedAt = DateTime.fromJSDate(now, { zone: timeZone }).toFormat('dd/MM/yyyy HH:mm');

  const document = new Document({
    sections: [
      {
        properties: { page: { size: { orientation: 'landscape' } } },
        children: [
          new Paragraph({ text: 'Solicitações', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: `Gerado em ${generatedAt}. Total: ${requests.length}.`,
            spacing: { after: 200 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: COLUMNS.map((name) => cell(name, true)),
              }),
              ...requests.map(
                (request) =>
                  new TableRow({ children: toRow(request, timeZone).map((text) => cell(text)) }),
              ),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}
