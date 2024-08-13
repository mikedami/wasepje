import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { reservedPath } from "~/constants";
import {
  createTRPCRouter,
  privateProcedure,
  publicProcedure,
} from "~/server/api/trpc";

const checkReserved = (path: string) => reservedPath.some((p) => p === path);

export const linkRouter = createTRPCRouter({
  getAll: privateProcedure.query(({ ctx }) => {
    return ctx.db.link.findMany({
      take: 10,
      where: { authorId: ctx.currentUserId ?? "" },
      orderBy: [{ createdAt: "desc" }],
    });
  }),

  getOne: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.link.findFirst({
        where: { id: input.id },
        include: { phones: true },
      });
    }),

  getLinkBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.link.findFirst({
        where: { slug: input.slug },
        include: { phones: true },
      });
    }),

  update: privateProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim(),
        slug: z.string().trim().toLowerCase(),
        message: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (checkReserved(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reserved word for slug.",
        });
      }

      try {
        const link = await ctx.db.link.update({
          where: { id: input.id },
          data: { name: input.name, slug: input.slug, message: input.message },
        });
        return link;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          // The .code property can be accessed in a type-safe manner
          if (e.code === "P2002") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Slug has been used.",
            });
          }
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  create: privateProcedure
    .input(
      z.object({
        name: z.string().trim(),
        slug: z.string().trim().toLowerCase(),
        message: z.string().optional(),
        phones: z.array(
          z.object({
            value: z.string().trim(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (checkReserved(input.slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reserved word for slug.",
        });
      }

      try {
        const authorId = ctx.currentUserId;

        const link = await ctx.db.link.create({
          data: {
            authorId,
            name: input.name,
            slug: input.slug,
            message: input.message,
            nextPhone: 0,
            phones: {
              createMany: {
                data: input.phones.map((p) => ({ number: p.value })),
              },
            },
          },
          include: {
            phones: true,
          },
        });

        return link;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          // The .code property can be accessed in a type-safe manner
          if (e.code === "P2002") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Slug has been used.",
            });
          }
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
    }),

  delete: privateProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.link.delete({
        where: {
          id: input.id,
        },
      });

      return link;
    }),

  updateNextPhone: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.link.findFirstOrThrow({
        where: { id: input.id },
        include: { phones: true },
      });

      const { nextPhone, phones, clicks } = link;

      let newNextPhone = Number(nextPhone + 1);

      if (newNextPhone > phones.length - 1) {
        newNextPhone = 0;
      }

      return await ctx.db.link.update({
        data: { nextPhone: newNextPhone, clicks: clicks + 1 },
        where: { id: input.id },
      });
    }),

  findFirst: publicProcedure.query(({ ctx }) => {
    return ctx.db.link.findFirst();
  }),
});
