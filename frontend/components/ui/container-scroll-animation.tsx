"use client";
import React, { useRef } from "react";
import { useScroll, useTransform, motion, MotionValue } from "framer-motion";

export const ContainerScroll = ({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  const scaleDimensions = () => {
    return isMobile ? [0.94, 1] : [0.98, 1];
  };

  const rotate = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], scaleDimensions());
  const headerTranslate = useTransform(scrollYProgress, [0, 1], [0, -28]);
  const cardTranslate = useTransform(scrollYProgress, [0, 1], [20, -20]);

  return (
    <div
      className="relative h-[68rem] md:h-[92rem] px-2 md:px-20"
      ref={containerRef}
    >
      <div
        className="sticky top-24 md:top-1/2 md:-translate-y-1/2 w-full py-8 md:py-0"
        style={{
          perspective: "1000px",
        }}
      >
        <Header translate={headerTranslate} titleComponent={titleComponent} />
        <Card rotate={rotate} translate={cardTranslate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  );
};

export const Header = ({ translate, titleComponent }: any) => {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="div max-w-5xl mx-auto text-center"
    >
      {titleComponent}
    </motion.div>
  );
};

export const Card = ({
  rotate,
  scale,
  translate,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  translate: MotionValue<number>;
  children: React.ReactNode;
}) => {
  return (
    <motion.div
      style={{
        rotateX: rotate,
        scale,
        translateY: translate,
        boxShadow:
          "0 14px 32px rgba(0,0,0,0.18), 0 40px 80px rgba(0,0,0,0.14)",
      }}
      className="max-w-5xl mt-8 md:mt-10 mx-auto h-[30rem] md:h-[40rem] w-full border border-[rgba(188,214,206,0.18)] p-2 md:p-6 bg-[rgba(12,22,34,0.78)] rounded-[30px] shadow-2xl"
    >
      <div className="h-full w-full overflow-hidden rounded-2xl bg-[rgba(15,29,43,0.92)] md:rounded-2xl md:p-4">
        {children}
      </div>
    </motion.div>
  );
};
