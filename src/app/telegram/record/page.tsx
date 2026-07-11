import TelegramRecordEditor from "@/components/TelegramRecordEditor";

type TelegramRecordPageProps = {
  searchParams: Promise<{
    record?: string | string[];
  }>;
};

export default async function TelegramRecordPage({ searchParams }: TelegramRecordPageProps) {
  const params = await searchParams;
  const rawRecordId = Array.isArray(params.record) ? params.record[0] : params.record;
  const recordId = /^[0-9a-f]{24}$/i.test(rawRecordId || "") ? rawRecordId || "" : "";

  return <TelegramRecordEditor recordId={recordId} />;
}
