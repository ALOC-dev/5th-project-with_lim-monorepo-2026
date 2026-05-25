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
    firstNo: z.string().optional(),
    secondNo: z.string().optional(),
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
