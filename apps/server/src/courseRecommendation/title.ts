type CourseSchedule = {
  readonly date: string;
  readonly startTime: string;
};

export const defaultCourseTitle = ({ date, startTime }: CourseSchedule): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일 ${startTime} 코스`;
};
