"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toApiUrl } from "@/lib/auth";

type TutorialDetail = {
  id: string;
  slug: string;
  title: string;
  tag: string;
  summary: string;
  content: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
};

type TutorialDetailPageProps = {
  params: { slug: string };
};

function formatDate(input: string) {
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return input;
  return date.toISOString().slice(0, 10);
}

export default function TutorialDetailPage({ params }: TutorialDetailPageProps) {
  const [item, setItem] = useState<TutorialDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(toApiUrl(`/api/v1/tutorials/${params.slug}`), {
          method: "GET",
        });
        if (response.status === 404) {
          setErrorMessage("Tutorial not found.");
          setLoading(false);
          return;
        }
        if (!response.ok) {
          setErrorMessage("Failed to load tutorial detail.");
          setLoading(false);
          return;
        }
        const data = (await response.json()) as TutorialDetail;
        setItem(data);
      } catch {
        setErrorMessage("Network error while loading tutorial detail.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [params.slug]);

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-16 pt-10 md:px-8">
      <article className="dashboard-card p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[#7a84ad]">Tutorial · Gewu</p>

        {loading ? <p className="mt-3 text-sm text-[#657096]">Loading...</p> : null}
        {errorMessage ? <p className="mt-3 text-sm text-[#bf3f3f]">{errorMessage}</p> : null}

        {!loading && !errorMessage && item ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold text-[#212948]">{item.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#6e789f]">
              <span className="rounded-full bg-[#edf1ff] px-2 py-1 text-[#5660a0]">{item.tag}</span>
              <span>Updated: {formatDate(item.updatedAt)}</span>
            </div>
            <p className="mt-4 text-sm text-[#5d678f]">{item.summary}</p>
            <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[#4f5a86]">{item.content}</div>
          </>
        ) : null}

        <div className="mt-8">
          <Link href="/tutorials" className="text-sm text-[#4651ba] hover:underline">
            Back to tutorials
          </Link>
        </div>
      </article>
    </main>
  );
}
