import { Icon } from "../../../components/Icon";
import type { CourseOption } from "../course.types";
import { formatCourseLeg, formatCourseSummary } from "../courseRecommendation.utils";
import { S } from "./CourseTimeline.styled";

type CourseTimelineProps = {
  readonly option: CourseOption;
};

export const CourseTimeline = ({ option }: CourseTimelineProps) => (
  <S.TimelineCard>
    <S.Heading>시간순 코스</S.Heading>
    <S.List role="list">
      {option.stops.map((stop, index) => {
        const nextStop = option.stops[index + 1];
        const leg = nextStop ? formatCourseLeg(nextStop) : null;
        const content = (
          <>
            <S.PlaceText>
              <S.PlaceName>{stop.name}</S.PlaceName>
              <S.PlaceMeta>
                {stop.activityLabel} · {stop.stayMinutes}분 체류
              </S.PlaceMeta>
            </S.PlaceText>
            {stop.placeUrl ? <Icon name="chevron-right" size={18} /> : null}
          </>
        );

        return (
          <S.Item $last={index === option.stops.length - 1} key={stop.id}>
            <S.Time dateTime={stop.visitTime}>{stop.visitTime}</S.Time>
            <S.Track aria-hidden="true">
              <S.Marker />
            </S.Track>
            {stop.placeUrl ? (
              <S.PlaceLink
                aria-label={`${stop.name} 카카오맵에서 보기`}
                href={stop.placeUrl}
                rel="noreferrer"
                target="_blank"
              >
                {content}
              </S.PlaceLink>
            ) : (
              <S.Place>{content}</S.Place>
            )}
            {leg ? <S.Leg>{leg}</S.Leg> : null}
          </S.Item>
        );
      })}
    </S.List>
    <S.FooterSummary>{formatCourseSummary(option)}</S.FooterSummary>
  </S.TimelineCard>
);
