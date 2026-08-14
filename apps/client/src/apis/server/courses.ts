import {
  type ApiResponse,
  CancelCourseResponseDataSchema,
  CourseOptionAnyDetailSchema,
  CourseResultSchema,
  createApiError,
  createApiResponseSchema,
  CreateCourseRequestSchema,
  CreateCourseResponseDataSchema,
  DeleteCourseResponseDataSchema,
  ListCoursesResponseDataSchema,
  ListFavoriteCourseOptionsResponseDataSchema,
  RemoveSavedCourseOptionResponseDataSchema,
  RenameCourseRequestSchema,
  RenameCourseResponseDataSchema,
  SearchCourseCandidatesResponseDataSchema,
  SetCourseOptionFavoriteRequestSchema,
  SetCourseOptionFavoriteResponseDataSchema,
} from "@monorepo/api-contracts";

import { serverApi, serverApiBaseUrl } from "../base";
import { toApiClientErrorMessage } from "../errors";

const ENDPOINT = "api/courses";

const createResponseSchema = createApiResponseSchema(CreateCourseResponseDataSchema);
const courseResultResponseSchema = createApiResponseSchema(CourseResultSchema);
const listCoursesResponseSchema = createApiResponseSchema(ListCoursesResponseDataSchema);
const optionResponseSchema = createApiResponseSchema(CourseOptionAnyDetailSchema);
const renameResponseSchema = createApiResponseSchema(RenameCourseResponseDataSchema);
const deleteResponseSchema = createApiResponseSchema(DeleteCourseResponseDataSchema);
const cancelResponseSchema = createApiResponseSchema(CancelCourseResponseDataSchema);
const favoritesResponseSchema = createApiResponseSchema(
  ListFavoriteCourseOptionsResponseDataSchema,
);
const favoriteResponseSchema = createApiResponseSchema(SetCourseOptionFavoriteResponseDataSchema);
const candidateSearchResponseSchema = createApiResponseSchema(
  SearchCourseCandidatesResponseDataSchema,
);
const removeSavedOptionResponseSchema = createApiResponseSchema(
  RemoveSavedCourseOptionResponseDataSchema,
);

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

export const removeSavedCourseOption = async (savedOptionId: string) => {
  try {
    return removeSavedOptionResponseSchema.parse(
      await serverApi
        .delete(`${ENDPOINT}/options/favorites/${encodeURIComponent(savedOptionId)}`)
        .json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};

export const getCourseStreamUrl = (courseId: string) =>
  new URL(`${coursePath(courseId)}/stream`, `${serverApiBaseUrl}/`).href;

export const searchCourseCandidates = async ({
  query,
  location,
}: {
  readonly query: string;
  readonly location?: { readonly lat: number; readonly lng: number };
}) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return candidateSearchResponseSchema.parse({ success: true, data: { items: [] } });
  }

  try {
    const searchParams: Record<string, string> = { q: normalizedQuery };
    if (location) {
      searchParams.lat = String(location.lat);
      searchParams.lng = String(location.lng);
    }
    return candidateSearchResponseSchema.parse(
      await serverApi.get("api/course-candidates/search", { searchParams }).json<unknown>(),
    );
  } catch (error) {
    return createApiError(toApiClientErrorMessage(error));
  }
};
