// External
import { useDispatch, useSelector } from 'react-redux';
import { checkPropTypes, object, func, array, bool } from 'prop-types';

// Internal
import * as selectors from './selectors';
import actions from './actions';
import { createFetchSelector } from '../fetch/selectors';

// Constants
const {
  groups: {
    getall: {
      request: getAll,
      cancel: getAllCancel,
      _meta: { isFetching: getAllisFetching },
    },
    add: {
      request: add,
      cancel: addCancel,
      _meta: { isFetching: getAddisFetching },
    },
    create: {
      request: create,
      cancel: createCancel,
      _meta: { isFetching: getCreateisFetching },
    },
    update: {
      request: update,
      cancel: updateCancel,
      _meta: { isFetching: getUpdateIsFetching },
    },
    delete: {
      request: deleteReq,
      cancel: deleteReqCancel,
      _meta: { isFetching: getDeleteIsFetching },
    },
    reset,
  },
} = actions;

/**
 * @method useGroupsHook
 * @desc connect to groups store
 * @example
 * const { groupList } = useGroupsHook();
 */
export const useGroupsHook = () => {
  const dispatch = useDispatch();
  const fetchSelector = createFetchSelector();

  const props = {
    // selectors
    groupStore: useSelector(selectors.getGroupsStore),
    groupList: useSelector(selectors.getGroupsList),
    groupListArray: useSelector(selectors.getGroupsListArray),
    groupAddIsFetching: useSelector(store =>
      fetchSelector(store, getAddisFetching)
    ),
    getUpdateIsFetching: useSelector(store =>
      fetchSelector(store, getUpdateIsFetching)
    ),
    groupAllIsFetching: useSelector(store =>
      fetchSelector(store, getAllisFetching)
    ),
    getCreateisFetching: useSelector(store =>
      fetchSelector(store, getCreateisFetching)
    ),
    getDeleteIsFetching: useSelector(store =>
      fetchSelector(store, getDeleteIsFetching)
    ),
    // actions
    groupFetch: () => dispatch(getAll()),
    groupFetchCancel: () => dispatch(getAllCancel()),
    groupAdd: info => dispatch(add(info)),
    groupAddCancel: () => dispatch(addCancel()),
    groupCreate: info => dispatch(create(info)),
    groupCreateCancel: () => dispatch(createCancel()),
    groupDelete: info => dispatch(deleteReq(info)),
    groupDeleteCancel: () => dispatch(deleteReqCancel()),
    groupUpdate: info => dispatch(update(info)),
    groupUpdateCancel: () => dispatch(updateCancel()),
    groupReset: () => dispatch(reset()),
  };

  const propTypes = {
    groupStore: object.isRequired,
    groupList: object,
    groupListArray: array,
    groupAllIsFetching: bool.isRequired,
    groupAddIsFetching: bool.isRequired,
    getUpdateIsFetching: bool.isRequired,
    getCreateisFetching: bool.isRequired,
    getDeleteIsFetching: bool.isRequired,
    groupFetch: func.isRequired,
    groupFetchCancel: func.isRequired,
    groupCreate: func.isRequired,
    groupCreateCancel: func.isRequired,
    groupAdd: func.isRequired,
    groupAddCancel: func.isRequired,
    groupDelete: func.isRequired,
    groupDeleteCancel: func.isRequired,
    groupUpdate: func.isRequired,
    groupUpdateCancel: func.isRequired,
    groupReset: func.isRequired,
  };

  checkPropTypes(propTypes, props, 'prop', `Hook: useGroupsHook`);

  return props;
};

export default {
  useGroupsHook,
};
