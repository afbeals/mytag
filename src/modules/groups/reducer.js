// Internal
import groupsActions from './actions';
import util from './util';

// Constants
const initialStore = util.buildInitialStore();
const {
  groups: {
    getall: { success: getAllSuccess },
    add: { success: addSuccess },
    create: { success: createSuccess },
    update: { success: updateSuccess },
    delete: { success: deleteSuccess },
    reset,
  },
} = groupsActions;

export default function reducer(state = initialStore, { type, payload }) {
  switch (type) {
    case getAllSuccess.type: {
      return {
        ...state,
        list: payload,
      };
    }

    case addSuccess.type:
    case createSuccess.type:
    case updateSuccess.type: {
      return {
        ...state,
        list: {
          ...state.list,
          ...payload,
        },
      };
    }

    case deleteSuccess.type: {
      const { [payload]: removed, ...rest } = { ...state.list };
      return {
        ...state,
        list: rest,
      };
    }

    case reset.type: {
      return initialStore;
    }

    default:
      return state;
  }
}
