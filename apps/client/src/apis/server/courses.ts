import {
  CancelCourseResponseDataSchema,
  CourseOptionDetailSchema,
  CourseResultSchema,
  CreateCourseRequestSchema,
  CreateCourseResponseDataSchema,
  createApiError,
  createApiResponseSchema,
  DeleteCourseResponseDataSchema,
  type ApiResponse,
  ListCoursesResponseDataSchema,
  ListFavoriteCourseOptionsResponseDataSchema,
  RenameCourseRequestSchema,
  RenameCourseResponseDataSchema,
  SetCourseOptionFavoriteRequestSchema,
  SetCourseOptionFavoriteResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi, serverApiBaseUrl } from "../base";
import { toApiClientErrorMessage } from "../errors";

const ENDPOINT = "api/courses";

const createResponseSchema = createApiResponseSchema(CreateCourseResponseDataSchema);
const courseResultResponseSchema = createApiResponseSchema(CourseResultSchema);
const listCoursesResponseSchema = createApiResponseSchema(ListCoursesResponseDataSchema);
const optionResponseSchema = createApiResponseSchema(CourseOptionDetailSchema);
const renameResponseSchema = createApiResponseSchema(RenameCourseResponseDataSchema);
const deleteResponseSchema = createApiResponseSchema(DeleteCourseResponseDataSchema);
const cancelResponseSchema = createApiResponseSchema(CancelCourseResponseDataSchema);
const favoritesResponseSchema = createApiResponseSchema(
  ListFavoriteCourseOptionsResponseDataSchema,
);
const favoriteResponseSchema = createApiResponseSchema(SetCourseOptionFavoriteResponseDataSchema);

const coursePath = (courseId: string) => `${ENDPOINT}/${encodeURIComponent(courseId)}`;

export const createCourse = async (
  input: unknown,
): Promise<ApiResponse<{ readonly courseId: string }>> => {
  try {
    const response = await serverApi
      .post(ENDPOINT, { json: CreateCourseRequestSchema.parse(input) })
      .json<unknown>();
    return createResponseSchema.parse(response);
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getCourse = async (courseId: string) => {
  try {
    return courseResultResponseSchema.parse(
      await serverApi.get(coursePath(courseId)).json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getCourseOption = async (courseId: string, optionId: string) => {
  try {
    return optionResponseSchema.parse(
      await serverApi
        .get(`${coursePath(courseId)}/options/${encodeURIComponent(optionId)}`)
        .json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getCourses = async () => {
  try {
    return listCoursesResponseSchema.parse(await serverApi.get(ENDPOINT).json<unknown>());
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const renameCourse = async (courseId: string, title: string) => {
  try {
    return renameResponseSchema.parse(
      await serverApi
        .patch(`${coursePath(courseId)}/title`, {
          json: RenameCourseRequestSchema.parse({ title }),
        })
        .json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const deleteCourse = async (courseId: string) => {
  try {
    return deleteResponseSchema.parse(await serverApi.delete(coursePath(courseId)).json<unknown>());
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const cancelCourse = async (courseId: string) => {
  try {
    return cancelResponseSchema.parse(
      await serverApi.post(`${coursePath(courseId)}/cancel`).json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getFavoriteCourseOptions = async () => {
  try {
    return favoritesResponseSchema.parse(
      await serverApi.get(`${ENDPOINT}/options/favorites`).json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const setCourseOptionFavorite = async (optionId: string, favorite: boolean) => {
  try {
    return favoriteResponseSchema.parse(
      await serverApi
        .patch(`${ENDPOINT}/options/${encodeURIComponent(optionId)}/favorite`, {
          json: SetCourseOptionFavoriteRequestSchema.parse({ favorite }),
        })
        .json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getCourseStreamUrl = (courseId: string) =>
  new URL(`${coursePath(courseId)}/stream`, `${serverApiBaseUrl}/`).href;
