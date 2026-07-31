import Image from "next/image";
import PageNumber from "./PageNumber";
import RevealOnScroll from "./RevealOnScroll";
import type { CoverData } from "@/data/schema";

type CoverPageProps = {
  data: CoverData;
};

export default function CoverPage({ data }: CoverPageProps) {
  return (
    <section className="page cover" id="cover">
      <Image
        src={data.bgImage}
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="page-bg"
        style={{ objectFit: "cover", objectPosition: "center 40%" }}
      />
      <div
        className="page-overlay"
        style={{ background: "linear-gradient(180deg,rgba(8,8,8,.15),rgba(8,8,8,.22))" }}
      />
      <RevealOnScroll className="visible cover-title">
        <h1>{data.title}</h1>
        <div className="cover-meta">
          {data.meta.map((item, i) => (
            <span key={`${item}-${i}`}>{item}</span>
          ))}
        </div>
        <div className="cover-sub">{data.subtitle}</div>
      </RevealOnScroll>
      <div className="cover-bottom">
        <RevealOnScroll className="visible">
          {data.bottomLine1}
          <br />
          {data.bottomLine2}
        </RevealOnScroll>
      </div>
      <PageNumber n={data.pageNumber} />
    </section>
  );
}
