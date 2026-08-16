import { z } from "zod";

export const TmapPoiSchema = z
  .object({
    id: z.string().optional(),
    pkey: z.string().optional(),
    name: z.string(),
    telNo: z.string().optional(),
    upperAddrName: z.string().optional(),
    middleAddrName: z.string().optional(),
    lowerAddrName: z.string().optional(),
    detailAddrName: z.string().optional(),
    roadName: z.string().optional(),
    /** 지번 본번/부번. 도로명 건물번호가 아니다. */
    firstNo: z.string().optional(),
    secondNo: z.string().optional(),
    /** 도로명 건물번호 본번/부번. */
    firstBuildNo: z.string().optional(),
    secondBuildNo: z.string().optional(),
    /**
     * 완성된 도로명주소가 들어 있는 곳. 결과가 없으면 빈 문자열로 오기도 해서
     * 객체와 문자열을 모두 받는다.
     */
    newAddressList: z
      .union([
        z
          .object({
            newAddress: z
              .array(
                z
                  .object({
                    roadName: z.string().optional(),
                    bldNo1: z.string().optional(),
                    bldNo2: z.string().optional(),
                    fullAddressRoad: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
        z.string(),
      ])
      .optional(),
    frontLon: z.string().optional(),
    frontLat: z.string().optional(),
    noorLon: z.string().optional(),
    noorLat: z.string().optional(),
    upperBizName: z.string().optional(),
    middleBizName: z.string().optional(),
    lowerBizName: z.string().optional(),
    detailBizName: z.string().optional(),
  })
  .passthrough();

export type TmapPoi = z.infer<typeof TmapPoiSchema>;

export const TmapLocalSearchResponseSchema = z
  .object({
    searchPoiInfo: z
      .object({
        totalCount: z.string(),
        count: z.string(),
        page: z.string(),
        pois: z
          .object({
            poi: z.array(TmapPoiSchema),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export type TmapLocalSearchResponse = z.infer<typeof TmapLocalSearchResponseSchema>;

export const TmapPoiDetailInfoSchema = z
  .object({
    id: z.string().optional(),
    pkey: z.string().optional(),
    navSeq: z.string().optional(),
    name: z.string().optional(),
    bizCatName: z.string().optional(),
    address: z.string().optional(),
    tel: z.string().optional(),
    telNo: z.string().optional(),
    parkFlag: z.string().optional(),
    frontLon: z.string().optional(),
    frontLat: z.string().optional(),
    noorLon: z.string().optional(),
    noorLat: z.string().optional(),
  })
  .passthrough();

export const TmapPoiDetailResponseSchema = z
  .object({
    poiDetailInfo: TmapPoiDetailInfoSchema,
  })
  .passthrough();

export type TmapPoiDetailResponse = z.infer<typeof TmapPoiDetailResponseSchema>;
