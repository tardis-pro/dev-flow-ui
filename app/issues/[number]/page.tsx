import { redirect } from "next/navigation";

type IssuePageProps = {
  params: { number: string };
  searchParams?: Record<string, string | string[]>;
};

export default function IssuePage({ params, searchParams }: IssuePageProps) {
  const target = new URLSearchParams(
    Object.entries(searchParams ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (Array.isArray(value)) {
        if (value.length) acc[key] = value[0];
      } else if (value) {
        acc[key] = value;
      }
      return acc;
    }, {}),
  );
  target.set("issue", params.number);
  redirect(`/?${target.toString()}`);
}
