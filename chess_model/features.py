import chess
import numpy as np

from chess_model.config import BOARD_SIZE, INPUT_PLANE_COUNT

PIECE_ORDER = (
    chess.PAWN,
    chess.KNIGHT,
    chess.BISHOP,
    chess.ROOK,
    chess.QUEEN,
    chess.KING,
)


def encode_features(board: chess.Board) -> np.ndarray:
    """Encode the position from the side-to-move perspective (NHWC)."""
    features = np.zeros(
        (BOARD_SIZE, BOARD_SIZE, INPUT_PLANE_COUNT),
        dtype=np.float32,
    )
    perspective = board.turn
    flip = perspective == chess.BLACK

    for square, piece in board.piece_map().items():
        row, column = _square_to_rc(square, flip)
        is_current = piece.color == perspective
        plane = PIECE_ORDER.index(piece.piece_type) + (0 if is_current else 6)
        features[row, column, plane] = 1.0

    # Plane 12: constant ones; EP square marked 0.5
    features[:, :, 12] = 1.0
    features[:, :, 13] = float(board.has_queenside_castling_rights(perspective))
    features[:, :, 14] = float(board.has_kingside_castling_rights(perspective))
    features[:, :, 15] = float(board.has_queenside_castling_rights(not perspective))
    features[:, :, 16] = float(board.has_kingside_castling_rights(not perspective))

    if board.ep_square is not None:
        row, column = _square_to_rc(board.ep_square, flip)
        features[row, column, 12] = 0.5

    return features


def _square_to_rc(square: int, flip: bool) -> tuple[int, int]:
    if flip:
        square = chess.square_mirror(square)
    rank = chess.square_rank(square)
    file = chess.square_file(square)
    row = 7 - rank
    return row, file


def move_to_from_to(board: chess.Board, move: chess.Move) -> tuple[int, int]:
    flip = board.turn == chess.BLACK
    from_row, from_col = _square_to_rc(move.from_square, flip)
    to_row, to_col = _square_to_rc(move.to_square, flip)
    return from_row * BOARD_SIZE + from_col, to_row * BOARD_SIZE + to_col


def policy_index_to_move(
    board: chess.Board,
    from_index: int,
    to_index: int,
) -> chess.Move | None:
    flip = board.turn == chess.BLACK
    from_square = _index_to_square(from_index, flip)
    to_square = _index_to_square(to_index, flip)
    move = chess.Move(from_square, to_square)
    if move in board.legal_moves:
        return move
    promo = chess.Move(from_square, to_square, promotion=chess.QUEEN)
    if promo in board.legal_moves:
        return promo
    return None


def _index_to_square(index: int, flip: bool) -> int:
    row, col = divmod(index, BOARD_SIZE)
    rank = 7 - row
    square = chess.square(col, rank)
    if flip:
        square = chess.square_mirror(square)
    return square
