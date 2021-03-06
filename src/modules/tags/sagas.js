// External
import {
  takeLatest,
  all,
  fork,
  race,
  take,
  cancel,
  put,
} from 'redux-saga/effects';

// Internal
import tagsActions from './actions';
import api from '~GlobalUtil/api';
import { normalize } from '~GlobalUtil/';
import groupsUtil from './util';
import appActions from '~Modules/app/actions';

// Constants
const { sagaRequest } = normalize;
const { normalizeTagsArray } = groupsUtil;
const {
  app: {
    notify: { show },
  },
} = appActions;
const {
  tags: {
    get: {
      request: getTags,
      success: getTagsSuccess,
      fail: getTagsFail,
      cancel: getTagsCancel,
    },
    create: {
      request: createTags,
      success: createTagsSuccess,
      fail: createTagsFail,
      cancel: createTagsCancel,
    },
    update: {
      request: updateTags,
      success: updateTagsSuccess,
      fail: updateTagsFail,
      cancel: updateTagsCancel,
    },
    delete: {
      request: deleteTags,
      success: deleteTagsSuccess,
      fail: deleteTagsFail,
      cancel: deleteTagsCancel,
    },
  },
} = tagsActions;

// success generators
function* getTagsSuccesses() {
  yield all([take(getTagsSuccess.type)]);
  return true;
}

function* deleteTagsSuccesses() {
  yield all([take(deleteTagsSuccess.type)]);
  return true;
}

function* createTagsSuccesses() {
  yield all([take(createTagsSuccess.type)]);
  return true;
}

function* updateTagsSuccesses() {
  yield all([take(updateTagsSuccess.type)]);
  return true;
}

// Series Generators
export function* tagsFetch() {
  try {
    const apiCalls = yield all([
      fork(sagaRequest, {
        params: [api.tags.fetch],
        successActs: [getTagsSuccess],
        successDataTrns: normalizeTagsArray,
        failActs: getTagsFail,
      }),
    ]);

    const { cancelSagas, success } = yield race({
      cancelSagas: take(getTagsCancel.type),
      success: getTagsSuccesses(),
    });

    if (cancelSagas) {
      for (let i = 0; i < apiCalls.length; i++) {
        yield cancel(apiCalls[i]);
      }
    } else {
      return success;
    }
  } catch (e) {
    yield put(show({ message: 'Error Fetching Tags', type: 'error' }));
  }
}

export function* tagsDelete({ payload }) {
  try {
    const apiCalls = yield all([
      fork(sagaRequest, {
        params: [api.tags.delete, payload],
        successActs: deleteTagsSuccess,
        successDataTrns: () => payload.id,
        failActs: deleteTagsFail,
      }),
    ]);

    const { cancelSagas, success } = yield race({
      cancelSagas: take(deleteTagsCancel.type),
      success: deleteTagsSuccesses(),
    });

    if (cancelSagas) {
      for (let i = 0; i < apiCalls.length; i++) {
        yield cancel(apiCalls[i]);
      }
    } else {
      return success;
    }
  } catch (e) {
    yield put(show({ message: 'Error Deleting Tags', type: 'error' }));
  }
}

export function* tagsUpdate({ payload }) {
  try {
    const apiCalls = yield all([
      fork(sagaRequest, {
        params: [api.tags.update, payload],
        successActs: updateTagsSuccess,
        successDataTrns: normalizeTagsArray,
        failActs: updateTagsFail,
      }),
    ]);

    const { cancelSagas, success } = yield race({
      cancelSagas: take(updateTagsCancel.type),
      success: updateTagsSuccesses(),
    });

    if (cancelSagas) {
      for (let i = 0; i < apiCalls.length; i++) {
        yield cancel(apiCalls[i]);
      }
    } else {
      return success;
    }
  } catch (e) {
    yield put(show({ message: 'Error Updating Tag', type: 'error' }));
  }
}

export function* tagsCreate({ payload }) {
  try {
    const apiCalls = yield all([
      fork(sagaRequest, {
        params: [api.tags.create, payload],
        successActs: createTagsSuccess,
        successDataTrns: normalizeTagsArray,
        failActs: createTagsFail,
      }),
    ]);

    const { cancelSagas, success } = yield race({
      cancelSagas: take(createTagsCancel.type),
      success: createTagsSuccesses(),
    });

    if (cancelSagas) {
      for (let i = 0; i < apiCalls.length; i++) {
        yield cancel(apiCalls[i]);
      }
    } else {
      return success;
    }
  } catch (e) {
    yield put(show({ message: 'Error Creating Tag', type: 'error' }));
  }
}

// WATCHERS
export function* watchRequestForCreateTag() {
  yield takeLatest(createTags.type, tagsCreate);
}

export function* watchRequestForFetchTags() {
  yield takeLatest(getTags.type, tagsFetch);
}

export function* watchRequestForDeleteTag() {
  yield takeLatest(deleteTags.type, tagsDelete);
}

export function* watchRequestForUpdateTags() {
  yield takeLatest(updateTags.type, tagsUpdate);
}

function* watcher() {
  yield all([
    watchRequestForCreateTag(),
    watchRequestForFetchTags(),
    watchRequestForDeleteTag(),
    watchRequestForUpdateTags(),
  ]);
}

export default watcher;
