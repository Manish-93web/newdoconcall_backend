const FamilyMember = require("../models/FamilyMember");
const { ok, created, ApiError } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const members = await FamilyMember.find({ primaryUser: req.user.id }).sort({ createdAt: -1 });
  return ok(res, members);
});

const create = asyncHandler(async (req, res) => {
  const member = await FamilyMember.create({ ...req.body, primaryUser: req.user.id });
  return created(res, member);
});

async function findOwned(id, userId) {
  const member = await FamilyMember.findOne({ _id: id, primaryUser: userId });
  if (!member) throw new ApiError(404, "NOT_FOUND", "Family member not found");
  return member;
}

const getOne = asyncHandler(async (req, res) => {
  const member = await findOwned(req.params.id, req.user.id);
  return ok(res, member);
});

const update = asyncHandler(async (req, res) => {
  await findOwned(req.params.id, req.user.id);
  const member = await FamilyMember.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  return ok(res, member, "Updated");
});

const remove = asyncHandler(async (req, res) => {
  await findOwned(req.params.id, req.user.id);
  await FamilyMember.findByIdAndDelete(req.params.id);
  return ok(res, null, "Deleted");
});

module.exports = { list, create, getOne, update, remove };
