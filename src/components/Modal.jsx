// External
import { forwardRef } from 'react';
import { func, any, string, node } from 'prop-types';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Slide from '@material-ui/core/Slide';

const DefaultTransition = forwardRef(function Transition(props, ref) {
  return <Slide direction='up' ref={ref} {...props} />;
});

const Modal = ({
  transition: Transition,
  onCancel,
  onConfirm,
  onClose,
  title,
  children,
}) => (
  <div>
    <Dialog
      open
      TransitionComponent={Transition || DefaultTransition}
      keepMounted
      onClose={onClose}
      aria-labelledby='alert-dialog-slide-title'
      aria-describedby='alert-dialog-slide-description'
    >
      {title && (
        <DialogTitle id='alert-dialog-slide-title'>{title}</DialogTitle>
      )}
      <DialogContent>
        <DialogContentText id='alert-dialog-slide-description'>
          {children}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {onCancel && (
          <Button onClick={onCancel} color='primary'>
            Cancel
          </Button>
        )}
        {onConfirm && (
          <Button onClick={onConfirm} color='primary'>
            Agree
          </Button>
        )}
      </DialogActions>
    </Dialog>
  </div>
);

Modal.propTypes = {
  onCancel: func,
  onConfirm: func,
  onClose: func,
  transition: any,
  children: node.isRequired,
  title: string,
};

Modal.defaultProps = {
  transition: null,
};

export default Modal;
