import { Message } from "discord.js";
import { prisma } from "./prisma";
export const MONTHLY_USAGE_LIMIT = 1000;

export const reachedUsageLimit = async (message: Message): Promise<boolean> => {
    const usage = await prisma.usage.findFirst({
        where: {
            id: message.author.id
        }
    });

    if(!usage) {
        await prisma.usage.create({
            data: {
                id: message.author.id,
            }
        })
        return false;
    } else if(new Date(Date.now()).getMilliseconds() - usage.date.getMilliseconds() > 60 * 1000 * 60 * 24 * 30) {
        await prisma.usageLog.create({
            data: {
                ...usage
            }
        });
        await prisma.usage.update({
            where: {
                id: message.author.id,
            },
            data: {
                date: new Date(Date.now()),
                count: 0
            }
        });
        return false;
    } else if(usage.count > MONTHLY_USAGE_LIMIT) {
        return true;
    } else {
        return false;
    }
}


export const addUsage = async (message: Message): Promise<void> => {
    await prisma.usage.update({
        where: {
            id: message.author.id
        },
        data: {
            count: {
                increment: 1
            }
        }
    })
}