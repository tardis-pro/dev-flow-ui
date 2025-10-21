import { redirect } from "next/navigation";

type IssuePageProps = {
  params: Promise<{ number: string }>;
  searchParams?: Promise<Record<string, string | string[]>>;
};

export default async function IssuePage({ params, searchParams }: IssuePageProps) {
  const { number } = await params;
  const searchParamsResolved = await searchParams;
  const target = new URLSearchParams(
    Object.entries(searchParamsResolved ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (Array.isArray(value)) {
        if (value.length) acc[key] = value[0];
      } else if (value) {
        acc[key] = value;
      }
      return acc;
    }, {}),
  );
  target.set("issue", number);
  redirect(`/?${target.toString()}`);
}
